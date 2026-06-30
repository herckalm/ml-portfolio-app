using System.Net;
using System.Text;
using MlPortfolio.Api.Services;

namespace MlPortfolio.Api.Tests;

/// <summary>
/// Unit tests for <see cref="MlServiceClient"/> using a stub HttpMessageHandler —
/// no real network, no app boot. Locks the two halves of the client's contract:
/// the request it emits, and how it parses the envelope it receives.
/// </summary>
public class MlServiceClientTests
{
    // Canned ml-service envelope for the DistilBERT predictor (the documented shape).
    private const string SuccessEnvelope = """
    {
      "model_id": "distilbert-cfpb",
      "model_version": "1.0.0",
      "result": { "label": "credit_card", "score": 0.94, "calibrated": true, "confidence_band": "high" },
      "meta": { "demo_mode": false, "input_chars": 52 }
    }
    """;

    [Fact]
    public async Task PredictAsync_DeserializesEnvelope_AndForwardsResultOpaquely()
    {
        var handler = new StubHandler(Ok(SuccessEnvelope));
        var client = ClientFor(handler);

        var envelope = await client.PredictAsync("distilbert-cfpb", "My credit card was charged twice.");

        Assert.Equal("distilbert-cfpb", envelope.ModelId);
        Assert.Equal("1.0.0", envelope.ModelVersion);
        Assert.False(envelope.Meta.DemoMode);
        Assert.Equal(52, envelope.Meta.InputChars);
        // result stays opaque — reach into the JsonElement to prove it round-tripped.
        Assert.Equal("credit_card", envelope.Result.GetProperty("label").GetString());
    }

    [Fact]
    public async Task PredictAsync_PostsTextToModelPredictPath()
    {
        var handler = new StubHandler(Ok(SuccessEnvelope));
        var client = ClientFor(handler);

        await client.PredictAsync("distilbert-cfpb", "hello there");

        Assert.Equal(HttpMethod.Post, handler.CapturedRequest!.Method);
        Assert.Equal(
            "http://ml-service.test/v1/models/distilbert-cfpb/predict",
            handler.CapturedRequest.RequestUri!.ToString());
        Assert.Contains("\"text\":\"hello there\"", handler.CapturedBody);
    }

    private static MlServiceClient ClientFor(StubHandler handler) =>
        new(new HttpClient(handler) { BaseAddress = new Uri("http://ml-service.test/") });

    private static HttpResponseMessage Ok(string json) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(json, Encoding.UTF8, "application/json")
    };

    /// <summary>Captures the outgoing request and returns a fixed response.</summary>
    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly HttpResponseMessage _response;
        public HttpRequestMessage? CapturedRequest { get; private set; }
        public string? CapturedBody { get; private set; }

        public StubHandler(HttpResponseMessage response) => _response = response;

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            CapturedRequest = request;
            if (request.Content is not null)
                CapturedBody = await request.Content.ReadAsStringAsync(cancellationToken);
            return _response;
        }
    }
}