namespace MlPortfolio.Api.Domain.Entities;

public class User
{
    public int Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Role { get; set; } = "user";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // navigation property for owned projects
    public ICollection<Project> Projects { get; set; } = new List<Project>();
}
