using System.ComponentModel.DataAnnotations;

namespace MlPortfolio.Api.Configuration;

/// <summary>
/// Strongly-typed binding for the "MlService" configuration section — the
/// upstream FastAPI inference service the backend proxies to. Bound at startup
/// and validated via data annotations, so a missing or malformed base URL fails
/// fast at boot rather than on the first prediction request. Mirrors the
/// fail-fast posture of <see cref="JwtOptions"/>.
/// </summary>
public class MlServiceOptions
{
    /// <summary>Configuration section name this class binds to (<c>MlService</c>).</summary>
    public const string SectionName = "MlService";

    /// <summary>
    /// Absolute base URL of the ml-service (scheme + host + port), e.g.
    /// <c>http://localhost:8000</c> in local dev or <c>http://ml-service:8000</c>
    /// inside docker-compose. The predict path is appended by the client.
    /// </summary>
    [Required]
    [Url(ErrorMessage = "MlService:BaseUrl must be a valid absolute URL.")]
    public string BaseUrl { get; set; } = string.Empty;

    /// <summary>
    /// Per-request timeout in seconds for calls to the ml-service. Bounded 1–120;
    /// defaults to 30 because a model's cold-start load on the first request can be
    /// slow. Applied to the typed HttpClient so a hung upstream surfaces as a
    /// timeout rather than a stuck request.
    /// </summary>
    [Range(1, 120, ErrorMessage = "MlService:TimeoutSeconds must be between 1 and 120.")]
    public int TimeoutSeconds { get; set; } = 30;
}