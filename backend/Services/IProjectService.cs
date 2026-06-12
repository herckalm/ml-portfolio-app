using MlPortfolio.Api.DTOs;

namespace MlPortfolio.Api.Services;

public interface IProjectService
{
    Task<IEnumerable<ProjectResponseDto>> GetAllAsync();
    Task<ProjectResponseDto> GetByIdAsync(int id);
    Task<ProjectResponseDto> CreateAsync(CreateProjectDto dto, int ownerId);
    Task<ProjectResponseDto> UpdateAsync(int id, UpdateProjectDto dto, int requestingUserId);
    Task DeleteAsync(int id, int requestingUserId);
}
