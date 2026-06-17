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

    // optional desired public handle for /u/{handle}.
    // if omitted, one is derived from the email. Validated only when provided
    // (the attributes treat null as valid), so it's completely optional.
    [MinLength(3, ErrorMessage = "Handle must be at least 3 characters.")]
    [MaxLength(30, ErrorMessage = "Handle must not exceed 30 characters.")]
    [RegularExpression(
        "^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$",
        ErrorMessage = "Handle may contain only letters, numbers, and single hyphens between them.")]
    public string? Handle { get; init; }

    // optional display name; defaults to the handle if omitted.
    [MaxLength(80)]
    public string? DisplayName { get; init; }
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

// field: Handle — so the client can link straight to the user's public page.
public record AuthResponse(string Token, string Email, string Role, string Handle);