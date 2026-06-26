namespace MlPortfolio.Api.Domain.Entities;

/// <summary>
/// A portfolio project owned by a single <see cref="User"/>. Projects start as
/// owner-only drafts and become visible on the owner's public page
/// (<c>/u/{handle}</c>) once <see cref="IsPublished"/> is set. Scalar fields map
/// directly to columns; see <see cref="Infrastructure.Data.AppDbContext"/> for
/// lengths, indexes, and the owner relationship.
/// </summary>
public class Project
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public string? GitHubUrl { get; set; }
    public string? ModelType { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public int OwnerId { get; set; }

    /// <summary>
    /// Owning user. The <c>null!</c> initializer asserts EF Core will populate
    /// this on load (every project has an owner), suppressing the nullable warning.
    /// </summary>
    public User Owner { get; set; } = null!;

    /// <summary>Visibility gate: <c>false</c> = draft (owner-only), <c>true</c> = public.</summary>
    public bool IsPublished { get; set; } = false;
}