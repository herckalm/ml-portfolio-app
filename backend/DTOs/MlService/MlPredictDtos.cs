using System.Text.Json;
using System.Text.Json.Serialization;

namespace MlPortfolio.Api.DTOs.MlService;

/// <summary>What the backend POSTs to the ml-service. Serializes to {"text": "..."}.</summary>
public class PredictRequest
{
    public string Text { get; set; } = string.Empty;
}

/// <summary>
/// The ml-service response envelope. <see cref="Result"/> is kept opaque (<see cref="JsonElement"/>) on purpose: the backend is model-agnostic and only forwards the inner result, while the frontend interprets model-specific fields. <see cref="Meta"/> is typed because the backend acts on <c>demo_mode</c>. Every field carries an explicit <see cref="JsonPropertyName"/> because this envelope is the ONE snake_case shape the API emits — the rest of the REST API is camelCase (MVC's default), and the frontend's Zod schema parses these exact snake_case keys. The attributes pin the wire contract independent of the controller's ambient serializer, so it's correct in both directions: inbound (deserialized from the snake_case ml-service response) and outbound (serialized to the browser).
/// </summary>
public class MlPredictResponse
{
    [JsonPropertyName("model_id")]
    public string ModelId { get; set; } = string.Empty;

    [JsonPropertyName("model_version")]
    public string ModelVersion { get; set; } = string.Empty;

    [JsonPropertyName("result")]
    public JsonElement Result { get; set; }

    [JsonPropertyName("meta")]
    public PredictMeta Meta { get; set; } = new();
}

/// <summary>Envelope metadata the backend reasons about (demo-mode gating, logging).</summary>
public class PredictMeta
{
    [JsonPropertyName("demo_mode")]
    public bool DemoMode { get; set; }

    [JsonPropertyName("input_chars")]
    public int InputChars { get; set; }
}