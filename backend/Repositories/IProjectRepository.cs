using MlPortfolio.Api.Domain.Entities;

namespace MlPortfolio.Api.Repositories;

public interface IProjectRepository
{
    Task<(IEnumerable<Project> Items, int Total)> GetAllAsync(int skip, int take);
    Task<Project?> GetByIdAsync(int id);
    Task<Project> CreateAsync(Project project);
    Task<Project> UpdateAsync(Project project);
    Task DeleteAsync(Project project);
}
