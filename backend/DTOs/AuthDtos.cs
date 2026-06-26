using System.ComponentModel.DataAnnotations;

namespace MlPortfolio.Api.DTOs;

/// <summary>
/// Registration payload. Validated via data annotations before the auth service
/// runs, so malformed input is rejected with 400 by the framework, not the service.
/// </summary>
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

    /// <summary>
    /// Optional public handle for <c>/u/{handle}</c>; the service derives one from
    /// the email when omitted. The attributes treat null as valid, so they apply
    /// only when a value is supplied — that's what makes the field truly optional
    /// while still constraining its shape when present.
    /// </summary>
    [MinLength(3, ErrorMessage = "Handle must be at least 3 characters.")]
    [MaxLength(30, ErrorMessage = "Handle must not exceed 30 characters.")]
    [RegularExpression(
        "^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$",
        ErrorMessage = "Handle may contain only letters, numbers, and single hyphens between them.")]
    public string? Handle { get; init; }

    /// <summary>Optional; the service defaults it to the handle when omitted.</summary>
    [MaxLength(80)]
    public string? DisplayName { get; init; }
}

/// <summary>Login payload. Verified against the stored password hash by the auth service.</summary>
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

/// <summary>
/// Successful-auth response from both register and login. <c>Handle</c> is
/// included so the client can link straight to the user's public page without a
/// follow-up request.
/// </summary>
public record AuthResponse(string Token, string Email, string Role, string Handle);