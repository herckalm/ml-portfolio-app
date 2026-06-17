namespace MlPortfolio.Api.Domain.Entities;

public class User
{
    public int Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Role { get; set; } = "user";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // public identity (URL slug, stored lowercase, unique)
    public string Handle { get; set; } = string.Empty;

    // profile
    public string DisplayName { get; set; } = string.Empty;
    public string? Bio { get; set; }

    public ICollection<Project> Projects { get; set; } = new List<Project>();
}