using MlPortfolio.Api.Domain.Entities;
using MlPortfolio.Api.DTOs;
using MlPortfolio.Api.DTOs.Common;
using MlPortfolio.Api.Exceptions;
using MlPortfolio.Api.Repositories;

namespace MlPortfolio.Api.Services;

/// <summary>
/// Implements <see cref="IProjectService"/>. Translates pagination queries into
/// skip/take, enforces the owner-scoped authorization rule (a project that's
/// missing OR not owned by the requester is reported as not-found, never as
/// forbidden), and maps entities to <see cref="ProjectResponseDto"/> via the
/// private helpers. Depends on the user repository only to resolve a handle to an
/// owner id for the public-by-handle listing.
/// </summary>
public class ProjectService : IProjectService
{
    private readonly IProjectRepository _repo;
    private readonly IUserRepository _userRepo;

    public ProjectService(IProjectRepository repo, IUserRepository userRepo)
    {
        _repo = repo;
        _userRepo = userRepo;
    }

    public async Task<PagedResult<ProjectResponseDto>> GetMyProjectsAsync(int ownerId, PaginationQuery query)
    {
        var skip = (query.Page - 1) * query.PageSize;
        var (items, total) = await _repo.GetByOwnerAsync(ownerId, skip, query.PageSize);
        return Page(items, total, query);
    }

    public async Task<PagedResult<ProjectResponseDto>> GetPublishedByHandleAsync(string handle, PaginationQuery query)
    {
        var owner = await _userRepo.GetByHandleAsync(handle)
            ?? throw new NotFoundException($"No portfolio found for handle '{handle}'.");

        var skip = (query.Page - 1) * query.PageSize;
        var (items, total) = await _repo.GetPublishedByOwnerAsync(owner.Id, skip, query.PageSize);
        return Page(items, total, query);
    }

    public async Task<ProjectResponseDto> GetPublishedByIdAsync(int id)
    {
        var project = await _repo.GetPublishedByIdAsync(id)
            ?? throw new NotFoundException($"Project with id {id} was not found.");
        return ToDto(project);
    }

    public async Task<ProjectResponseDto> CreateAsync(CreateProjectDto dto, int ownerId)
    {
        var project = new Project
        {
            Title = dto.Title,
            Description = dto.Description,
            Domain = dto.Domain,
            ModelType = dto.ModelType,
            GitHubUrl = dto.GitHubUrl,
            CreatedAt = DateTime.UtcNow,
            OwnerId = ownerId
        };

        var created = await _repo.CreateAsync(project);
        return ToDto(created);
    }

    public async Task<ProjectResponseDto> UpdateAsync(int id, UpdateProjectDto dto, int requestingUserId)
    {
        // Missing or not-owned are collapsed into the same not-found result.
        var project = await _repo.GetByIdAsync(id);
        if (project is null || project.OwnerId != requestingUserId)
            throw new NotFoundException($"Project with id {id} was not found.");

        project.Title = dto.Title;
        project.Description = dto.Description;
        project.Domain = dto.Domain;
        project.ModelType = dto.ModelType;
        project.GitHubUrl = dto.GitHubUrl;

        var updated = await _repo.UpdateAsync(project);
        return ToDto(updated);
    }

    public async Task<ProjectResponseDto> SetPublishedAsync(int id, bool publish, int requestingUserId)
    {
        var project = await _repo.GetByIdAsync(id);
        if (project is null || project.OwnerId != requestingUserId)
            throw new NotFoundException($"Project with id {id} was not found.");

        project.IsPublished = publish;
        var updated = await _repo.UpdateAsync(project);
        return ToDto(updated);
    }

    public async Task DeleteAsync(int id, int requestingUserId)
    {
        var project = await _repo.GetByIdAsync(id);
        if (project is null || project.OwnerId != requestingUserId)
            throw new NotFoundException($"Project with id {id} was not found.");

        await _repo.DeleteAsync(project);
    }

    private static PagedResult<ProjectResponseDto> Page(
        IEnumerable<Project> items, int total, PaginationQuery query) => new()
        {
            Items = items.Select(ToDto),
            Total = total,
            Page = query.Page,
            PageSize = query.PageSize
        };

    /// <summary>Maps a project entity to its response DTO, coalescing a null ModelType to empty string.</summary>
    private static ProjectResponseDto ToDto(Project p) => new()
    {
        Id = p.Id,
        Title = p.Title,
        Description = p.Description,
        Domain = p.Domain,
        ModelType = p.ModelType ?? string.Empty,
        GitHubUrl = p.GitHubUrl,
        CreatedAt = p.CreatedAt,
        OwnerId = p.OwnerId,
        IsPublished = p.IsPublished
    };
}