using System.Net;
using System.Text;
using MlPortfolio.Api.Exceptions;
using MlPortfolio.Api.Services;

namespace MlPortfolio.Api.Tests;

/// <summary>
/// Unit tests for <see cref="MlServiceClient"/> using a stub HttpMessageHandler —
/// no real network, no app boot. Locks the two halves of the client's contract:
/// the request it emits, and how it parses the envelope it receives — plus the
/// error contract: each upstream status maps to a typed exception carrying the
/// upstream `detail`, which GlobalExceptionHandler later echoes into RFC 7807.
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

    // --- Error contract: status → typed exception, upstream `detail` preserved ---

    [Fact]
    public async Task PredictAsync_On404_ThrowsModelNotFound_WithUpstreamDetail()
    {
        const string detail = "Unknown model_id 'bogus'.";
        var handler = new StubHandler(Error(HttpStatusCode.NotFound, $$"""{"detail": "{{detail}}"}"""));
        var client = ClientFor(handler);

        var ex = await Assert.ThrowsAsync<MlServiceModelNotFoundException>(
            () => client.PredictAsync("bogus", "My credit card was charged twice."));

        // Message == upstream detail → GlobalExceptionHandler echoes it into 7807.
        Assert.Equal(detail, ex.Message);
    }

    [Fact]
    public async Task PredictAsync_On422_ThrowsValidation_WithUpstreamDetail()
    {
        const string detail = "Input too short after cleaning: need at least 10 characters, got 4.";
        var handler = new StubHandler(Error(HttpStatusCode.UnprocessableEntity, $$"""{"detail": "{{detail}}"}"""));
        var client = ClientFor(handler);

        var ex = await Assert.ThrowsAsync<MlServiceValidationException>(
            () => client.PredictAsync("distilbert-cfpb", "XX"));

        Assert.Equal(detail, ex.Message);
    }

    [Fact]
    public async Task PredictAsync_On503_ThrowsUnavailable_WithUpstreamDetail()
    {
        // The controller catches THIS to serve demo mode; the client just reports it.
        const string detail = "Model 'distilbert-cfpb' is not loaded (artifact unavailable).";
        var handler = new StubHandler(Error(HttpStatusCode.ServiceUnavailable, $$"""{"detail": "{{detail}}"}"""));
        var client = ClientFor(handler);

        var ex = await Assert.ThrowsAsync<MlServiceUnavailableException>(
            () => client.PredictAsync("distilbert-cfpb", "My credit card was charged twice."));

        Assert.Equal(detail, ex.Message);
    }

    [Fact]
    public async Task PredictAsync_On422ArrayDetail_ExtractsFirstMessage()
    {
        // FastAPI's *automatic* validation form: detail is an array of error objects.
        var body = """{"detail": [{"loc": ["body", "text"], "msg": "field required"}]}""";
        var handler = new StubHandler(Error(HttpStatusCode.UnprocessableEntity, body));
        var client = ClientFor(handler);

        var ex = await Assert.ThrowsAsync<MlServiceValidationException>(
            () => client.PredictAsync("distilbert-cfpb", ""));

        Assert.Equal("field required", ex.Message);
    }

    [Fact]
    public async Task PredictAsync_OnUnmappedStatus_ThrowsBaseException()
    {
        // A status the contract doesn't define (upstream 500) → base type → global 500.
        var handler = new StubHandler(Error(HttpStatusCode.InternalServerError, """{"detail": "boom"}"""));
        var client = ClientFor(handler);

        var ex = await Assert.ThrowsAsync<MlServiceException>(
            () => client.PredictAsync("distilbert-cfpb", "My credit card was charged twice."));

        // Base type exactly — not one of the three mapped subclasses.
        Assert.Equal(typeof(MlServiceException), ex.GetType());
        Assert.Contains("500", ex.Message);
        Assert.Contains("boom", ex.Message);
    }

    [Fact]
    public async Task PredictAsync_OnNonJsonErrorBody_FallsBackWithoutThrowingParseError()
    {
        // A proxy HTML error page, not JSON — extraction must degrade, not crash.
        var handler = new StubHandler(Error(HttpStatusCode.BadGateway, "<html>502 Bad Gateway</html>"));
        var client = ClientFor(handler);

        var ex = await Assert.ThrowsAsync<MlServiceException>(
            () => client.PredictAsync("distilbert-cfpb", "My credit card was charged twice."));

        // 502 is unmapped → base exception; the message carries the fallback detail.
        Assert.Contains("502", ex.Message);
    }

    private static MlServiceClient ClientFor(StubHandler handler) =>
        new(new HttpClient(handler) { BaseAddress = new Uri("http://ml-service.test/") });

    private static HttpResponseMessage Ok(string json) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(json, Encoding.UTF8, "application/json")
    };

    private static HttpResponseMessage Error(HttpStatusCode status, string json) => new(status)
    {
        Content = new StringContent(json, Encoding.UTF8, "application/json")
    };

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

    // ─────────────────────────────────────────────────────────────────────────────
    // Image path tests
    // ─────────────────────────────────────────────────────────────────────────────

    private const string ImageSuccessEnvelope = """
{
  "model_id": "vit-cifar10",
  "model_version": "1.0.0",
  "result": { "label": "cat", "score": 0.95 },
  "meta": { "demo_mode": false, "input_chars": 0 }
}
""";

    [Fact]
    public async Task PredictImageAsync_DeserializesEnvelope_AndForwardsResultOpaquely()
    {
        var handler = new StubHandler(Ok(ImageSuccessEnvelope));
        var client = ClientFor(handler);

        var envelope = await client.PredictImageAsync(
            "vit-cifar10", new byte[] { 0xFF, 0xD8 }, "image/jpeg");

        Assert.Equal("vit-cifar10", envelope.ModelId);
        Assert.Equal("1.0.0", envelope.ModelVersion);
        Assert.False(envelope.Meta.DemoMode);
        // result stays opaque — reach in to verify it round-tripped.
        Assert.Equal("cat", envelope.Result.GetProperty("label").GetString());
        Assert.Equal(0.95, envelope.Result.GetProperty("score").GetDouble(), precision: 2);
    }

    [Fact]
    public async Task PredictImageAsync_PostsMultipartToModelPredictImagePath()
    {
        var handler = new StubHandler(Ok(ImageSuccessEnvelope));
        var client = ClientFor(handler);
        var fakeBytes = new byte[] { 0x89, 0x50, 0x4E, 0x47 }; // PNG magic

        await client.PredictImageAsync("vit-cifar10", fakeBytes, "image/png");

        Assert.Equal(HttpMethod.Post, handler.CapturedRequest!.Method);
        Assert.Equal(
            "http://ml-service.test/v1/models/vit-cifar10/predict-image",
            handler.CapturedRequest.RequestUri!.ToString());

        // The request must be multipart/form-data, not JSON.
        Assert.StartsWith(
            "multipart/form-data",
            handler.CapturedRequest.Content!.Headers.ContentType!.MediaType);
    }

    [Fact]
    public async Task PredictImageAsync_On503_ThrowsUnavailable()
    {
        const string detail = "Model 'vit-cifar10' is not loaded (artifact unavailable).";
        var handler = new StubHandler(Error(HttpStatusCode.ServiceUnavailable, $$"""{"detail": "{{detail}}"}"""));
        var client = ClientFor(handler);

        var ex = await Assert.ThrowsAsync<MlServiceUnavailableException>(
            () => client.PredictImageAsync("vit-cifar10", new byte[] { 0xFF, 0xD8 }, "image/jpeg"));

        Assert.Equal(detail, ex.Message);
    }

    [Fact]
    public async Task PredictImageAsync_On415_ThrowsBaseException()
    {
        // 415 is not a mapped status in the contract — falls through to base type → global 500.
        var handler = new StubHandler(Error(HttpStatusCode.UnsupportedMediaType, """{"detail": "Unsupported image type."}"""));
        var client = ClientFor(handler);

        var ex = await Assert.ThrowsAsync<MlServiceException>(
            () => client.PredictImageAsync("vit-cifar10", new byte[] { 0x00 }, "image/tiff"));

        Assert.Equal(typeof(MlServiceException), ex.GetType());
        Assert.Contains("415", ex.Message);
    }
}