using MlPortfolio.Api.DTOs;
using MlPortfolio.Api.DTOs.Common;

namespace MlPortfolio.Api.Services;

public interface IProjectService
{
    Task<PagedResult<ProjectResponseDto>> GetAllAsync(PaginationQuery query);
    Task<ProjectResponseDto> GetByIdAsync(int id);
    Task<ProjectResponseDto> CreateAsync(CreateProjectDto dto, int ownerId);
    Task<ProjectResponseDto> UpdateAsync(int id, UpdateProjectDto dto, int requestingUserId);
    Task DeleteAsync(int id, int requestingUserId);
}
