using System.ComponentModel.DataAnnotations;

namespace MlPortfolio.Api.Configuration;

/// <summary>
/// Strongly-typed binding for the "Jwt" configuration section, used to issue and
/// validate auth tokens. Bound at startup and validated via data annotations, so
/// a missing or too-short secret fails fast at boot rather than at first login.
/// </summary>
public class JwtOptions
{
    /// <summary>Configuration section name this class binds to (<c>Jwt</c>).</summary>
    public const string SectionName = "Jwt";

    /// <summary>
    /// Signing key for HMAC-SHA256. Minimum 32 chars (256-bit) is enforced because
    /// the key must be at least as wide as the hash output, or token signing throws.
    /// Supplied via user-secrets in dev and a real secret store in production.
    /// </summary>
    [Required]
    [MinLength(32, ErrorMessage = "Jwt:Secret must be at least 32 characters (256-bit) for HMAC-SHA256.")]
    public string Secret { get; set; } = string.Empty;

    /// <summary>Token issuer (<c>iss</c>) claim; validated on incoming tokens.</summary>
    [Required]
    public string Issuer { get; set; } = string.Empty;

    /// <summary>Token audience (<c>aud</c>) claim; validated on incoming tokens.</summary>
    [Required]
    public string Audience { get; set; } = string.Empty;

    /// <summary>Token lifetime in hours. Bounded 1–720 (max 30 days); defaults to 24.</summary>
    [Range(1, 720, ErrorMessage = "Jwt:ExpiryHours must be between 1 and 720.")]
    public int ExpiryHours { get; set; } = 24;
}