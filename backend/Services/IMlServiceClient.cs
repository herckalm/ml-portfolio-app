using MlPortfolio.Api.DTOs.MlService;

namespace MlPortfolio.Api.Services;

/// <summary>
/// Outbound client to the FastAPI ml-service. Error shaping (422/404 → ProblemDetails,
/// 503 → demo mode) lives upstream of this client in the controller; this interface is
/// the seam they build on.
/// </summary>
public interface IMlServiceClient
{
    Task<MlPredictResponse> PredictAsync(
        string modelId, string text, CancellationToken cancellationToken = default);

    /// <summary>
    /// Sends image bytes to <c>POST /v1/models/{modelId}/predict-image</c> as
    /// <c>multipart/form-data</c> and returns the uniform envelope.
    /// </summary>
    /// <param name="modelId">The model identifier (e.g. <c>vit-cifar10</c>).</param>
    /// <param name="fileBytes">Raw image bytes.</param>
    /// <param name="contentType">
    ///   MIME type of the image (<c>image/jpeg</c>, <c>image/png</c>,
    ///   <c>image/webp</c>, <c>image/gif</c>). The ml-service enforces its own
    ///   allowlist and returns 415 for anything outside it.
    /// </param>
    /// <param name="cancellationToken">Propagated to the outbound HTTP call.</param>
    Task<MlPredictResponse> PredictImageAsync(
        string modelId, byte[] fileBytes, string contentType,
        CancellationToken cancellationToken = default);
}