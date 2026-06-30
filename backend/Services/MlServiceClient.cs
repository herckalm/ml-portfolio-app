using System.Net.Http.Json;
using System.Text.Json;
using MlPortfolio.Api.DTOs.MlService;

namespace MlPortfolio.Api.Services;

/// <summary>
/// Typed <see cref="HttpClient"/> wrapper for the ml-service. The HttpClient's
/// BaseAddress and Timeout are configured at registration (step 4) from
/// MlServiceOptions, so this class only owns the call shape and (de)serialization.
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

        // Happy path only. Later threads REPLACE this line with status inspection:
        // 503 -> demo-mode 200 envelope, 422/404 -> ProblemDetails via a thrown
        // upstream exception. For now, any non-2xx throws HttpRequestException.
        response.EnsureSuccessStatusCode();

        var envelope = await response.Content
            .ReadFromJsonAsync<MlPredictResponse>(JsonOptions, cancellationToken);

        return envelope
            ?? throw new InvalidOperationException("ml-service returned an empty response body.");
    }
}