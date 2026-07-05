using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.TestHost;
using MlPortfolio.Api.DTOs.MlService;
using MlPortfolio.Api.Exceptions;
using MlPortfolio.Api.Services;

namespace MlPortfolio.Api.Tests;

/// <summary>
/// Integration tests for POST /api/predict/{modelId} through the real HTTP
/// pipeline. Each test replaces <see cref="IMlServiceClient"/> with a stub that
/// reproduces one upstream outcome, then asserts the wire response — proving the controller's 503→demo conversion and the 404/422→ProblemDetails shaping that the client-level unit tests can't reach.
/// </summary>
public class PredictEndpointTests
{
    // a JsonElement result the frontend renders, for the happy-path stub.
    private const string HappyResultJson =
        """{ "label": "Credit card", "score": 0.94, "calibrated": true, "confidence_band": "high" }""";

    [Fact]
    public async Task Predict_On503_ReturnsDemoEnvelope_200()
    {
        var client = ClientWithStub(new ThrowingStub(
            new MlServiceUnavailableException("Model 'distilbert-cfpb' is not loaded (artifact unavailable).")));

        var response = await client.PostAsJsonAsync(
            "/api/predict/distilbert-cfpb", new { text = "My credit card was charged twice." });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;

        // the demo conversion happened: valid envelope, demo_mode true, sentinel version.
        Assert.True(GetBool(root, "meta", "demo_mode"));
        Assert.Equal("distilbert-cfpb", GetString(root, "model_id"));
        Assert.Equal("demo", GetString(root, "model_version"));
        // Canned result is renderable: high band + a real label.
        Assert.Equal("high", root.GetProperty("result")
                    .GetProperty("confidence_band").GetString());
    }

    [Fact]
    public async Task Predict_OnModelNotFound_Returns404ProblemDetails()
    {
        const string detail = "Unknown model_id 'bogus'.";
        var client = ClientWithStub(new ThrowingStub(new MlServiceModelNotFoundException(detail)));

        var response = await client.PostAsJsonAsync(
            "/api/predict/bogus", new { text = "My credit card was charged twice." });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;
        Assert.Equal(404, root.GetProperty("status").GetInt32());
        Assert.Equal("Model Not Found", root.GetProperty("title").GetString());
        // the upstream detail was echoed into the 7807 body.
        Assert.Equal(detail, root.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Predict_OnValidation_Returns422ProblemDetails()
    {
        const string detail = "Input too short after cleaning: need at least 10 characters, got 4.";
        var client = ClientWithStub(new ThrowingStub(new MlServiceValidationException(detail)));

        var response = await client.PostAsJsonAsync(
            "/api/predict/distilbert-cfpb", new { text = "XXXX" });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;
        Assert.Equal(422, root.GetProperty("status").GetInt32());
        Assert.Equal("Validation Failed", root.GetProperty("title").GetString());
        Assert.Equal(detail, root.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Predict_OnSuccess_PassesEnvelopeThrough_200()
    {
        using var resultDoc = JsonDocument.Parse(HappyResultJson);
        var envelope = new MlPredictResponse
        {
            ModelId = "distilbert-cfpb",
            ModelVersion = "1.0.0",
            Result = resultDoc.RootElement.Clone(),
            Meta = new PredictMeta { DemoMode = false, InputChars = 33 }
        };
        var client = ClientWithStub(new ReturningStub(envelope));

        var response = await client.PostAsJsonAsync(
            "/api/predict/distilbert-cfpb", new { text = "My credit card was charged twice." });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;
        Assert.False(GetBool(root, "meta", "demo_mode"));
        Assert.Equal("1.0.0", GetString(root, "model_version"));
    }

    // helper functions

    private static HttpClient ClientWithStub(IMlServiceClient stub)
    {
        var factory = new PredictApiFactory().WithWebHostBuilder(builder =>
            builder.ConfigureTestServices(services =>
            {
                // Drop the real typed-HttpClient registration, insert the stub.
                var existing = services.Single(d => d.ServiceType == typeof(IMlServiceClient));
                services.Remove(existing);
                services.AddScoped(_ => stub);
            }));
        return factory.CreateClient();
    }

    // Envelope fields MUST be snake_case on the wire — the frontend's Zod schema parses these exact keys. These accessors demand snake_case and fail on any other casing, so a regression to MVC's default camelCase breaks the suite instead of slipping through. (Enforced by [JsonPropertyName] on the DTO.)
    private static string GetString(JsonElement obj, string snake) =>
        obj.GetProperty(snake).GetString()!;

    private static bool GetBool(JsonElement obj, string parent, string snake) =>
        obj.GetProperty(parent).GetProperty(snake).GetBoolean();

    /// <summary>stub that throws a chosen exception on every call.</summary>
    private sealed class ThrowingStub : IMlServiceClient
    {
        private readonly Exception _toThrow;
        public ThrowingStub(Exception toThrow) => _toThrow = toThrow;
        public Task<MlPredictResponse> PredictAsync(
            string modelId, string text, CancellationToken cancellationToken = default) =>
            throw _toThrow;
    }

    /// <summary>stub that returns a fixed envelope.</summary>
    private sealed class ReturningStub : IMlServiceClient
    {
        private readonly MlPredictResponse _envelope;
        public ReturningStub(MlPredictResponse envelope) => _envelope = envelope;
        public Task<MlPredictResponse> PredictAsync(
            string modelId, string text, CancellationToken cancellationToken = default) =>
            Task.FromResult(_envelope);
    }
}