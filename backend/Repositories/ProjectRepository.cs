using Microsoft.EntityFrameworkCore;
using MlPortfolio.Api.Domain.Entities;
using MlPortfolio.Api.Infrastructure.Data;

namespace MlPortfolio.Api.Repositories;

public class ProjectRepository : IProjectRepository
{
    private readonly AppDbContext _db;

    public ProjectRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<(IEnumerable<Project> Items, int Total)> GetAllAsync(int skip, int take)
    {
        var query = _db.Projects.AsNoTracking().OrderByDescending(p => p.CreatedAt);

        var total = await query.CountAsync();
        var items = await query.Skip(skip).Take(take).ToListAsync();

        return (items, total);
    }

    public async Task<Project?> GetByIdAsync(int id)
    {
        return await _db.Projects.FindAsync(id);
    }

    public async Task<Project> CreateAsync(Project project)
    {
        _db.Projects.Add(project);
        await _db.SaveChangesAsync();
        return project;
    }

    public async Task<Project> UpdateAsync(Project project)
    {
        _db.Projects.Update(project);
        await _db.SaveChangesAsync();
        return project;
    }

    public async Task DeleteAsync(Project project)
    {
        _db.Projects.Remove(project);
        await _db.SaveChangesAsync();
    }
}
