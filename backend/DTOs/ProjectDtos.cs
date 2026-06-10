using System.ComponentModel.DataAnnotations;

namespace MlPortfolio.Api.DTOs;

public class CreateProjectDto
{
    [Required, MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string Description { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string Domain { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string ModelType { get; set; } = string.Empty;
}

public class UpdateProjectDto
{
    [Required, MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string Description { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string Domain { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string ModelType { get; set; } = string.Empty;
}

public class ProjectResponseDto
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public string ModelType { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }

    // expose who owns the project
    public int OwnerId { get; set; }
}
