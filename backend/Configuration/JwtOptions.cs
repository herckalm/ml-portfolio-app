using System.ComponentModel.DataAnnotations;

namespace MlPortfolio.Api.Configuration;

public class JwtOptions
{
    public const string SectionName = "Jwt";

    [Required]
    [MinLength(32, ErrorMessage = "Jwt:Secret must be at least 32 characters (256-bit) for HMAC-SHA256.")]
    public string Secret { get; set; } = string.Empty;

    [Required]
    public string Issuer { get; set; } = string.Empty;

    [Required]
    public string Audience { get; set; } = string.Empty;

    [Range(1, 720, ErrorMessage = "Jwt:ExpiryHours must be between 1 and 720.")]
    public int ExpiryHours { get; set; } = 24;
}