using System.ComponentModel.DataAnnotations;

namespace MlPortfolio.Api.DTOs.MlService;

/// <summary>
/// Inbound predict request from a browser/API client to the backend. Distinct
/// from <see cref="PredictRequest"/> (backend → ml-service): this one is the
/// public API surface and carries validation. <see cref="ModelId"/> is in the
/// route, so only the text is in the body.
/// </summary>
public class PredictApiRequest
{
    [Required(AllowEmptyStrings = false, ErrorMessage = "Text is required.")]
    public string Text { get; set; } = string.Empty;
}