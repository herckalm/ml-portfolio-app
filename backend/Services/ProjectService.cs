using MlPortfolio.Api.Domain.Entities;
using MlPortfolio.Api.DTOs;
using MlPortfolio.Api.Exceptions;
using MlPortfolio.Api.Repositories;

namespace MlPortfolio.Api.Services;

public class ProjectService : IProjectService
{
    private readonly IProjectRepository _repo;

    public ProjectService(IProjectRepository repo)
    {
        _repo = repo;
    }

    public async Task<IEnumerable<ProjectResponseDto>> GetAllAsync()
    {
        var projects = await _repo.GetAllAsync();
        return projects.Select(ToDto);
    }

    public async Task<ProjectResponseDto> GetByIdAsync(int id)
    {
        var project = await _repo.GetByIdAsync(id)
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
            CreatedAt = DateTime.UtcNow,
            OwnerId = ownerId
        };

        var created = await _repo.CreateAsync(project);
        return ToDto(created);
    }

    public async Task<ProjectResponseDto> UpdateAsync(int id, UpdateProjectDto dto, int requestingUserId)
    {
        var project = await _repo.GetByIdAsync(id)
            ?? throw new NotFoundException($"Project with id {id} was not found.");

        // ownership check lives in the service layer
        if (project.OwnerId != requestingUserId)
            throw new ForbiddenAccessException("You do not own this project.");

        project.Title = dto.Title;
        project.Description = dto.Description;
        project.Domain = dto.Domain;
        project.ModelType = dto.ModelType;

        var updated = await _repo.UpdateAsync(project);
        return ToDto(updated);
    }

    public async Task DeleteAsync(int id, int requestingUserId)
    {
        var project = await _repo.GetByIdAsync(id)
            ?? throw new NotFoundException($"Project with id {id} was not found.");

        // ownership check lives in the service layer
        if (project.OwnerId != requestingUserId)
            throw new ForbiddenAccessException("You do not own this project.");

        await _repo.DeleteAsync(project);
    }

    private static ProjectResponseDto ToDto(Project p) => new()
    {
        Id = p.Id,
        Title = p.Title,
        Description = p.Description,
        Domain = p.Domain,
        ModelType = p.ModelType ?? string.Empty,
        CreatedAt = p.CreatedAt,
        OwnerId = p.OwnerId
    };
}
