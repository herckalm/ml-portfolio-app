using System.ComponentModel.DataAnnotations;

namespace MlPortfolio.Api.DTOs;

/// <summary>
/// Inbound payload for creating a project. Note <see cref="ModelType"/> is
/// required here even though the <c>Project</c> entity stores it as nullable —
/// the create contract is deliberately stricter than the storage model.
/// </summary>
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

    [Url, MaxLength(500)]
    public string? GitHubUrl { get; set; }
}

/// <summary>
/// Inbound payload for a full (PUT-style) project update — field-for-field
/// identical to <see cref="CreateProjectDto"/>. Ownership, timestamps, and
/// publish state are not settable through this contract.
/// </summary>
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

    [Url, MaxLength(500)]
    public string? GitHubUrl { get; set; }
}

/// <summary>
/// Inbound payload for toggling publish state. Kept separate from the edit DTOs
/// so publishing is a deliberate, isolated action rather than a side effect of a
/// content update.
/// </summary>
public class SetPublishedDto
{
    public bool IsPublished { get; set; }
}

/// <summary>
/// Outbound representation of a project. Flattens the entity for the client —
/// exposes <see cref="OwnerId"/> but never the owner navigation object.
/// </summary>
public class ProjectResponseDto
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public string ModelType { get; set; } = string.Empty;
    public string? GitHubUrl { get; set; }
    public DateTime CreatedAt { get; set; }
    public int OwnerId { get; set; }
    public bool IsPublished { get; set; }
}