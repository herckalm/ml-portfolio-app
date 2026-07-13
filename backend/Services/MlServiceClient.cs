using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using MlPortfolio.Api.DTOs.MlService;
using MlPortfolio.Api.Exceptions;

namespace MlPortfolio.Api.Services;

/// <summary>
/// Typed <see cref="HttpClient"/> wrapper for the ml-service. The HttpClient's
/// BaseAddress and Timeout are configured at registration from MlServiceOptions,
/// so this class only owns the call shape and (de)serialization.
///
/// Pure transport: classifies upstream HTTP status into the
/// <c>MlService*</c> exception vocabulary. Product policy (503 → demo mode) lives
/// in <see cref="Controllers.PredictController"/>.
/// </summary>
public class MlServiceClient : IMlServiceClient
{
    private readonly HttpClient _http;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true
    };

    public MlServiceClient(HttpClient http) => _http = http;

    // text prediction

    public async Task<MlPredictResponse> PredictAsync(
        string modelId, string text, CancellationToken cancellationToken = default)
    {
        var payload = new PredictRequest { Text = text };

        using var response = await _http.PostAsJsonAsync(
            $"v1/models/{modelId}/predict", payload, JsonOptions, cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            var detail = await ReadDetailAsync(response, cancellationToken);
            throw ClassifyError(response.StatusCode, detail);
        }

        return await DeserializeEnvelopeAsync(response, cancellationToken);
    }

    // Image prediction

    /// <inheritdoc/>
    public async Task<MlPredictResponse> PredictImageAsync(
        string modelId, byte[] fileBytes, string contentType,
        CancellationToken cancellationToken = default)
    {
        // Build the multipart part. FastAPI reads the UploadFile from the field
        // named "file". We derive a minimal filename from the content-type so the
        // part is well-formed; the ml-service validates the extension/MIME itself
        // and returns 415 for anything it doesn't accept.
        var filename = ContentTypeToFilename(contentType);

        using var multipart = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(fileBytes);
        fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
        multipart.Add(fileContent, "file", filename);

        using var response = await _http.PostAsync(
            $"v1/models/{modelId}/predict-image", multipart, cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            var detail = await ReadDetailAsync(response, cancellationToken);
            throw ClassifyError(response.StatusCode, detail);
        }

        return await DeserializeEnvelopeAsync(response, cancellationToken);
    }

    // Shared helpers

    /// <summary>
    /// Centralised status → typed exception mapping shared by both call paths.
    /// 415 (Unsupported Media Type) is intentionally not mapped here — it falls
    /// through to the base <see cref="MlServiceException"/> and surfaces as a 500
    /// via GlobalExceptionHandler, which is the correct passthrough for a content
    /// contract violation the proxy doesn't define a policy for.
    /// </summary>
    private static MlServiceException ClassifyError(HttpStatusCode status, string detail) =>
        status switch
        {
            HttpStatusCode.NotFound =>
                new MlServiceModelNotFoundException(detail),
            HttpStatusCode.UnprocessableEntity =>
                new MlServiceValidationException(detail),
            HttpStatusCode.ServiceUnavailable =>
                new MlServiceUnavailableException(detail),
            _ => new MlServiceException(
                $"ml-service returned {(int)status}: {detail}")
        };

    private async Task<MlPredictResponse> DeserializeEnvelopeAsync(
        HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var envelope = await response.Content
            .ReadFromJsonAsync<MlPredictResponse>(JsonOptions, cancellationToken);

        return envelope
            ?? throw new InvalidOperationException("ml-service returned an empty response body.");
    }

    /// <summary>
    /// Maps a MIME type to a plausible filename for the multipart part.
    /// Covers the four content types the ml-service accepts; anything else
    /// gets a generic <c>.bin</c> extension so the part is still well-formed
    /// (the ml-service will reject it with 415).
    /// </summary>
    private static string ContentTypeToFilename(string contentType) =>
        contentType.ToLowerInvariant() switch
        {
            "image/jpeg" => "upload.jpg",
            "image/png" => "upload.png",
            "image/webp" => "upload.webp",
            "image/gif" => "upload.gif",
            _ => "upload.bin"
        };

    /// <summary>
    /// Extracts the upstream error <c>detail</c> from a FastAPI error body.
    /// Handles both the flat-string form and FastAPI's automatic-validation array
    /// form, and degrades to a generic message for missing or unparseable bodies.
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
                JsonValueKind.String => detail.GetString() ?? fallback,
                JsonValueKind.Array when detail.GetArrayLength() > 0 =>
                    detail[0].TryGetProperty("msg", out var msg)
                        ? msg.GetString() ?? fallback
                        : fallback,
                _ => fallback
            };
        }
        catch (JsonException)
        {
            return fallback;
        }
    }
}