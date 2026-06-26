using MlPortfolio.Api.Domain.Entities;

namespace MlPortfolio.Api.Repositories;

/// <summary>
/// Persistence contract for <see cref="Project"/>. Read methods split along two
/// axes the service layer cares about: owner-scoped vs. public (published-only),
/// and tracked vs. untracked. The "Published" variants apply the visibility
/// filter in SQL; the plain <see cref="GetByIdAsync"/> returns a tracked entity
/// for mutation, while the read paths are untracked.
/// </summary>
public interface IProjectRepository
{
    /// <summary>All of an owner's projects (drafts included), paged, newest first. Untracked.</summary>
    Task<(IEnumerable<Project> Items, int Total)> GetByOwnerAsync(int ownerId, int skip, int take);

    /// <summary>An owner's published projects only, paged, newest first. Untracked.</summary>
    Task<(IEnumerable<Project> Items, int Total)> GetPublishedByOwnerAsync(int ownerId, int skip, int take);

    /// <summary>
    /// Single project by id, <b>tracked</b> — intended for update/delete/publish
    /// paths that mutate the returned entity. Null if not found.
    /// </summary>
    Task<Project?> GetByIdAsync(int id);

    /// <summary>
    /// Single <b>published</b> project by id, untracked — the public detail read.
    /// A draft or missing id returns null.
    /// </summary>
    Task<Project?> GetPublishedByIdAsync(int id);

    /// <summary>Inserts a new project and returns it with its generated id.</summary>
    Task<Project> CreateAsync(Project project);

    /// <summary>Persists changes to an already-tracked project.</summary>
    Task<Project> UpdateAsync(Project project);

    /// <summary>Deletes a project.</summary>
    Task DeleteAsync(Project project);
}