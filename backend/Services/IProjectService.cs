using MlPortfolio.Api.DTOs;
using MlPortfolio.Api.DTOs.Common;

namespace MlPortfolio.Api.Services;

public interface IProjectService
{
    Task<PagedResult<ProjectResponseDto>> GetMyProjectsAsync(int ownerId, PaginationQuery query);
    Task<PagedResult<ProjectResponseDto>> GetPublishedByHandleAsync(string handle, PaginationQuery query);
    Task<ProjectResponseDto> GetPublishedByIdAsync(int id);
    Task<ProjectResponseDto> CreateAsync(CreateProjectDto dto, int ownerId);
    Task<ProjectResponseDto> UpdateAsync(int id, UpdateProjectDto dto, int requestingUserId);
    Task<ProjectResponseDto> SetPublishedAsync(int id, bool publish, int requestingUserId);
    Task DeleteAsync(int id, int requestingUserId);
}