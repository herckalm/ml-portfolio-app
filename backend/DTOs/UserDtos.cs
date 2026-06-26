using System.ComponentModel.DataAnnotations;

namespace MlPortfolio.Api.DTOs;

/// <summary>
/// Public-facing profile projection shown on <c>/u/{handle}</c>. Carries only
/// non-sensitive identity fields — no email, role, or auth state. The entity's
/// <c>CreatedAt</c> is surfaced here renamed as <see cref="MemberSince"/>.
/// </summary>
public class UserProfileDto
{
    public string Handle { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Bio { get; set; }
    public DateTime MemberSince { get; set; }
}

/// <summary>
/// Inbound payload for editing one's own profile. <c>Handle</c> is intentionally
/// absent — its omission is what makes handles immutable after registration.
/// </summary>
public class UpdateProfileDto
{
    [Required, MaxLength(80)]
    public string DisplayName { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Bio { get; set; }
}