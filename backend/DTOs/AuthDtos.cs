using System.ComponentModel.DataAnnotations;

namespace MlPortfolio.Api.DTOs;

public record RegisterRequest
{
    [Required]
    [EmailAddress]
    [MaxLength(256)]
    public string Email { get; init; } = string.Empty;

    [Required]
    [MinLength(8, ErrorMessage = "Password must be at least 8 characters.")]
    [MaxLength(100, ErrorMessage = "Password must not exceed 100 characters.")]
    public string Password { get; init; } = string.Empty;
}

public record LoginRequest
{
    [Required]
    [EmailAddress]
    [MaxLength(256)]
    public string Email { get; init; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string Password { get; init; } = string.Empty;
}

public record AuthResponse(string Token, string Email, string Role);
