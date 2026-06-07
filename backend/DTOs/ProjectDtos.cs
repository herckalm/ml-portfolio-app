using System.ComponentModel.DataAnnotations;

namespace MlPortfolio.Api.DTOs;

// What clients send on POST
public class CreateProjectDto
{
    [Required, MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string Description { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string ModelType { get; set; } = string.Empty;
}

// What clients send on PUT — same fields, same validation
public class UpdateProjectDto
{
    [Required, MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string Description { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string ModelType { get; set; } = string.Empty;
}

// What clients receive
public class ProjectResponseDto
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string ModelType { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
