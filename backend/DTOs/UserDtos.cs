using System.ComponentModel.DataAnnotations;

namespace MlPortfolio.Api.DTOs;

public class UserProfileDto
{
    public string Handle { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Bio { get; set; }
    public DateTime MemberSince { get; set; }
}

public class UpdateProfileDto
{
    [Required, MaxLength(80)]
    public string DisplayName { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Bio { get; set; }
}