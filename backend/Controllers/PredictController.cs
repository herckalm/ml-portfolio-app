using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using MlPortfolio.Api.DTOs.MlService;
using MlPortfolio.Api.Exceptions;
using MlPortfolio.Api.Services;

namespace MlPortfolio.Api.Controllers;

/// <summary>
/// Inference proxy under <c>api/predict</c>. Public (no auth) — demo surface.
/// Thin by design: validates the input contract the backend owns, forwards to the
/// ml-service via <see cref="IMlServiceClient"/>, and returns the envelope unchanged
/// on success.
///
/// Error shaping: ml-service 404/422 bubble to GlobalExceptionHandler as RFC 7807
/// ProblemDetails. 503 is caught here and converted to a demo-mode 200 — product
/// policy kept deliberately out of the transport client, for both endpoints.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class PredictController : ControllerBase
{
    private readonly IMlServiceClient _mlService;

    // snake_case policy shared by both demo envelopes so they serialize
    // identically to real upstream responses.
    private static readonly JsonSerializerOptions DemoJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
    };

    public PredictController(IMlServiceClient mlService)
    {
        _mlService = mlService;
    }

    // Text prediction

    /// <summary>
    /// POST <c>/api/predict/{modelId}</c> — runs text inference for the named model.
    /// </summary>
    [HttpPost("{modelId}")]
    public async Task<ActionResult<MlPredictResponse>> Predict(
        string modelId, PredictApiRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var envelope = await _mlService.PredictAsync(modelId, request.Text, cancellationToken);
            return Ok(envelope);
        }
        catch (MlServiceUnavailableException)
        {
            return Ok(BuildTextDemoEnvelope(modelId, request.Text));
        }
    }

    // Image prediction

    /// <summary>
    /// POST <c>/api/predict/{modelId}/image</c> — runs image inference for the
    /// named model. Accepts <c>multipart/form-data</c> with a single file field.
    /// Returns the ml-service envelope on success, or a CV demo-mode envelope of
    /// the same shape on 503 (model not loaded). 404/422/415 surface as
    /// ProblemDetails via the global handler.
    /// </summary>
    [HttpPost("{modelId}/image")]
    public async Task<ActionResult<MlPredictResponse>> PredictImage(
        string modelId, IFormFile file, CancellationToken cancellationToken)
    {
        // Read the raw bytes once; IFormFile's stream is not seekable after the
        // first read and the multipart body is already buffered by the framework.
        byte[] fileBytes;
        using (var ms = new MemoryStream())
        {
            await file.CopyToAsync(ms, cancellationToken);
            fileBytes = ms.ToArray();
        }

        // Forward the browser's content-type verbatim. The ml-service validates
        // whether it's in its own allowlist and returns 415 for anything outside it —
        // that falls through ClassifyError to a base MlServiceException → global 500.
        var contentType = file.ContentType;

        try
        {
            var envelope = await _mlService.PredictImageAsync(
                modelId, fileBytes, contentType, cancellationToken);
            return Ok(envelope);
        }
        catch (MlServiceUnavailableException)
        {
            // Same demo-mode degradation as the text path, but with the CV canned
            // result shape: {label, score} only — no calibrated, no confidence_band.
            return Ok(BuildImageDemoEnvelope(modelId));
        }
    }

    // Demo envelope builders

    /// <summary>
    /// Text demo — mirrors the documented distilbert-cfpb result shape exactly.
    /// </summary>
    private static MlPredictResponse BuildTextDemoEnvelope(string modelId, string text)
    {
        var cannedResult = new
        {
            label = "Credit card",
            score = 0.94,
            calibrated = true,
            confidence_band = "high"
        };

        var resultElement = JsonSerializer.SerializeToElement(cannedResult, DemoJsonOptions);

        return new MlPredictResponse
        {
            ModelId = modelId,
            ModelVersion = "demo",
            Result = resultElement,
            Meta = new PredictMeta
            {
                DemoMode = true,
                InputChars = text.Length
            }
        };
    }

    /// <summary>
    /// CV demo — mirrors the documented vit-cifar10 result shape: {label, score} only.
    /// <c>model_version</c> is the <c>"demo"</c> sentinel so telemetry can distinguish
    /// canned from real output. <c>input_chars</c> is 0 — not meaningful for images.
    /// </summary>
    private static MlPredictResponse BuildImageDemoEnvelope(string modelId)
    {
        var cannedResult = new
        {
            label = "cat",
            score = 0.95
        };

        var resultElement = JsonSerializer.SerializeToElement(cannedResult, DemoJsonOptions);

        return new MlPredictResponse
        {
            ModelId = modelId,
            ModelVersion = "demo",
            Result = resultElement,
            Meta = new PredictMeta
            {
                DemoMode = true,
                InputChars = 0   // not meaningful for binary image payloads
            }
        };
    }
}