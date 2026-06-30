using System.Text.Json;

namespace MlPortfolio.Api.DTOs.MlService;

/// <summary>What the backend POSTs to the ml-service. Serializes to {"text": "..."}.</summary>
public class PredictRequest
{
    public string Text { get; set; } = string.Empty;
}

/// <summary>
/// The ml-service response envelope. <see cref="Result"/> is kept opaque
/// (<see cref="JsonElement"/>) on purpose: the backend is model-agnostic and only
/// forwards the inner result, while the frontend interprets model-specific fields.
/// <see cref="Meta"/> is typed because the backend acts on <c>demo_mode</c>.
/// </summary>
public class MlPredictResponse
{
    public string ModelId { get; set; } = string.Empty;
    public string ModelVersion { get; set; } = string.Empty;
    public JsonElement Result { get; set; }
    public PredictMeta Meta { get; set; } = new();
}

/// <summary>Envelope metadata the backend reasons about (demo-mode gating, logging).</summary>
public class PredictMeta
{
    public bool DemoMode { get; set; }
    public int InputChars { get; set; }
}