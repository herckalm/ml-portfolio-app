using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using MlPortfolio.Api.DTOs.MlService;
using MlPortfolio.Api.Exceptions;
using MlPortfolio.Api.Services;

namespace MlPortfolio.Api.Controllers;

/// <summary>
/// Inference proxy under <c>api/predict</c>. Public (no auth) — this is the demo
/// surface a portfolio visitor hits. Thin by design: validates the input contract
/// the backend owns, forwards to the ml-service via <see cref="IMlServiceClient"/>,
/// and returns the envelope unchanged on success.
///
/// Error shaping is split by concern: ml-service 404/422 bubble to
/// <see cref="Middleware.GlobalExceptionHandler"/> as RFC 7807 ProblemDetails,
/// while 503 (model not loaded) is caught here and converted to a demo-mode 200 —
/// the one place product policy ("unavailable means serve a canned example") lives,
/// deliberately kept out of the transport client.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class PredictController : ControllerBase
{
    private readonly IMlServiceClient _mlService;

    // Same snake_case policy the client uses, so a demo envelope serializes
    // identically to a real one (demo_mode, model_id, …).
    private static readonly JsonSerializerOptions DemoJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
    };

    public PredictController(IMlServiceClient mlService)
    {
        _mlService = mlService;
    }

    /// <summary>
    /// POST <c>/api/predict/{modelId}</c> — runs inference for the named model.
    /// Returns the ml-service envelope (<c>model_id, model_version, result, meta</c>)
    /// as-is on success, or a demo-mode envelope of the same shape when the upstream
    /// model isn't loaded (503). Unknown-model (404) and validation (422) surface as
    /// ProblemDetails via the global handler.
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
            // Model registered but not loaded upstream. Degrade gracefully: return a
            // valid envelope the frontend renders with a demo badge, rather than an
            // error. 404/422 are intentionally NOT caught — they belong to the global
            // ProblemDetails handler.
            return Ok(BuildDemoEnvelope(modelId, request.Text));
        }
    }

    /// <summary>
    /// Synthesizes a demo-mode envelope matching the real DistilBERT contract: 
    /// a canned high-confidence classification so the frontend exercises its full
    /// render path (humanized label + demo badge). <c>model_version</c> is the
    /// <c>"demo"</c> sentinel so telemetry can distinguish canned from real output.
    /// </summary>
    private static MlPredictResponse BuildDemoEnvelope(string modelId, string text)
    {
        // Canned result mirrors the documented distilbert-cfpb shape exactly.
        var cannedResult = new
        {
            label = "Credit card",
            score = 0.94,
            calibrated = true,
            confidence_band = "high"
        };

        // Serialize → reparse into a JsonElement so it drops into the opaque
        // Result slot identically to a real upstream result.
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
}