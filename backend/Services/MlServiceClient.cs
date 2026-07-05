using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MlPortfolio.Api.DTOs.MlService;
using MlPortfolio.Api.Exceptions;

namespace MlPortfolio.Api.Services;

/// <summary>
/// Typed <see cref="HttpClient"/> wrapper for the ml-service. The HttpClient's
/// BaseAddress and Timeout are configured at registration (step 4) from
/// MlServiceOptions, so this class only owns the call shape and (de)serialization.
///
/// Pure transport: it classifies the upstream's HTTP status into the
/// <c>MlService*</c> exception vocabulary and extracts the upstream <c>detail</c>,
/// but owns no product policy. The 503 → demo-mode decision lives in
/// <see cref="Controllers.PredictController"/>; here 503 simply throws
/// <see cref="MlServiceUnavailableException"/>.
/// </summary>
public class MlServiceClient : IMlServiceClient
{
    private readonly HttpClient _http;

    // snake_case both ways: ModelId <-> model_id, DemoMode <-> demo_mode, etc.
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true
    };

    public MlServiceClient(HttpClient http) => _http = http;

    public async Task<MlPredictResponse> PredictAsync(
        string modelId, string text, CancellationToken cancellationToken = default)
    {
        var payload = new PredictRequest { Text = text };

        // Relative URI — BaseAddress (with trailing slash) is set at registration.
        using var response = await _http.PostAsJsonAsync(
            $"v1/models/{modelId}/predict", payload, JsonOptions, cancellationToken);

        // Status classification replaces the old EnsureSuccessStatusCode(). Each
        // arm reads the upstream `detail` and throws a typed exception the global
        // handler maps to 7807 — except 503, which the controller turns into demo
        // mode. The happy path (2xx) falls through to deserialization below.
        if (!response.IsSuccessStatusCode)
        {
            var detail = await ReadDetailAsync(response, cancellationToken);

            throw response.StatusCode switch
            {
                HttpStatusCode.NotFound =>
                    new MlServiceModelNotFoundException(detail),
                HttpStatusCode.UnprocessableEntity =>
                    new MlServiceValidationException(detail),
                HttpStatusCode.ServiceUnavailable =>
                    new MlServiceUnavailableException(detail),
                // Any other non-2xx (500, 502, timeouts surfaced as 5xx, …) is an
                // upstream fault the contract doesn't define — base type → 500.
                _ => new MlServiceException(
                    $"ml-service returned {(int)response.StatusCode}: {detail}")
            };
        }

        var envelope = await response.Content
            .ReadFromJsonAsync<MlPredictResponse>(JsonOptions, cancellationToken);

        return envelope
            ?? throw new InvalidOperationException("ml-service returned an empty response body.");
    }

    /// <summary>
    /// Extracts the upstream error <c>detail</c> from a FastAPI error body.
    /// Handles both the router's flat-string form (<c>{"detail": "…"}</c>) and
    /// FastAPI's automatic-validation array form (<c>{"detail": [{"msg": "…"}]}</c>),
    /// and degrades to a generic message when the body is missing or unparseable —
    /// so a malformed upstream error never crashes the proxy.
    /// </summary>
    private static async Task<string> ReadDetailAsync(
        HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var fallback = $"ml-service request failed ({(int)response.StatusCode}).";
        try
        {
            using var doc = JsonDocument.Parse(
                await response.Content.ReadAsStringAsync(cancellationToken));

            if (!doc.RootElement.TryGetProperty("detail", out var detail))
                return fallback;

            return detail.ValueKind switch
            {
                // Router form: {"detail": "Unknown model_id '…'."}
                JsonValueKind.String => detail.GetString() ?? fallback,
                // FastAPI auto-validation form: {"detail": [{"msg": "…"}, …]}
                JsonValueKind.Array when detail.GetArrayLength() > 0 =>
                    detail[0].TryGetProperty("msg", out var msg)
                        ? msg.GetString() ?? fallback
                        : fallback,
                _ => fallback
            };
        }
        catch (JsonException)
        {
            // Non-JSON body (proxy HTML error page, empty body, …).
            return fallback;
        }
    }
}