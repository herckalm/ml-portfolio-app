using Microsoft.AspNetCore.Mvc;
using MlPortfolio.Api.DTOs.MlService;
using MlPortfolio.Api.Services;

namespace MlPortfolio.Api.Controllers;

/// <summary>
/// Inference proxy under <c>api/predict</c>. Public (no auth) — this is the demo
/// surface a portfolio visitor hits. Thin by design: validates the input contract
/// the backend owns, forwards to the ml-service via <see cref="IMlServiceClient"/>,
/// and returns the envelope unchanged. Upstream error shaping (ml-service 422/404
/// → ProblemDetails, 503 → demo mode) is added in later threads; today this is the
/// happy path.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class PredictController : ControllerBase
{
    private readonly IMlServiceClient _mlService;

    public PredictController(IMlServiceClient mlService)
    {
        _mlService = mlService;
    }

    /// <summary>
    /// POST <c>/api/predict/{modelId}</c> — runs inference for the named model.
    /// Returns the ml-service envelope (<c>model_id, model_version, result, meta</c>)
    /// as-is, so the frontend codes against one stable shape across all models.
    /// </summary>
    [HttpPost("{modelId}")]
    public async Task<ActionResult<MlPredictResponse>> Predict(
        string modelId, PredictApiRequest request, CancellationToken cancellationToken)
    {
        var envelope = await _mlService.PredictAsync(modelId, request.Text, cancellationToken);
        return Ok(envelope);
    }
}