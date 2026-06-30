using MlPortfolio.Api.DTOs.MlService;

namespace MlPortfolio.Api.Services;

/// <summary>
/// Outbound client to the FastAPI ml-service. One method for now — predict against
/// a named model. Error shaping (422/404 → ProblemDetails, 503 → demo mode) lives
/// upstream of this client in later threads; this interface is the seam they build on.
/// </summary>
public interface IMlServiceClient
{
    Task<MlPredictResponse> PredictAsync(string modelId, string text, CancellationToken cancellationToken = default);
}