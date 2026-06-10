namespace MlPortfolio.Api.Domain.Entities;

public class Project
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public string? GitHubUrl { get; set; }
    public string? ModelType { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // ownership foreign key + navigation
    public int OwnerId { get; set; }
    public User Owner { get; set; } = null!;
}
