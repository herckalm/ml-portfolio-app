using MlPortfolio.Api.DTOs;
using MlPortfolio.Api.DTOs.Common;

namespace MlPortfolio.Api.Services;

/// <summary>
/// Project use-cases sitting between the controllers and the repository. Owns the
/// authorization rule for owner-scoped operations: update/publish/delete take the
/// requesting user's id and treat "not yours" identically to "doesn't exist"
/// (both surface as not-found), so the API never confirms a foreign project's
/// existence. Returns DTOs, never entities.
/// </summary>
public interface IProjectService
{
    /// <summary>The caller's own projects (drafts included), paged.</summary>
    Task<PagedResult<ProjectResponseDto>> GetMyProjectsAsync(int ownerId, PaginationQuery query);

    /// <summary>A user's published projects by their public handle, paged. Not-found if the handle is unknown.</summary>
    Task<PagedResult<ProjectResponseDto>> GetPublishedByHandleAsync(string handle, PaginationQuery query);

    /// <summary>A single published project by id. Not-found if missing or still a draft.</summary>
    Task<ProjectResponseDto> GetPublishedByIdAsync(int id);

    /// <summary>Creates a project owned by <paramref name="ownerId"/>.</summary>
    Task<ProjectResponseDto> CreateAsync(CreateProjectDto dto, int ownerId);

    /// <summary>Full update; owner-scoped. Not-found if missing or not owned by the requester.</summary>
    Task<ProjectResponseDto> UpdateAsync(int id, UpdateProjectDto dto, int requestingUserId);

    /// <summary>Toggles publish state; owner-scoped, same not-found rule.</summary>
    Task<ProjectResponseDto> SetPublishedAsync(int id, bool publish, int requestingUserId);

    /// <summary>Deletes a project; owner-scoped, same not-found rule.</summary>
    Task DeleteAsync(int id, int requestingUserId);
}