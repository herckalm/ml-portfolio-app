namespace MlPortfolio.Api.Domain.Entities;

public class Project
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;      // e.g. "NLP", "Vision"
    public string? GitHubUrl { get; set; }
    public string? ModelType { get; set; }                  // e.g. "BERT", "ResNet"
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
