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

    // owner-scoped, (dashboard "my projects").
    public Task<(IEnumerable<Project> Items, int Total)> GetByOwnerAsync(int ownerId, int skip, int take) =>
        PageAsync(
            _db.Projects
                .AsNoTracking()
                .Where(p => p.OwnerId == ownerId)
                .OrderByDescending(p => p.CreatedAt),
            skip, take);

    // owner-scoped, PUBLISHED only (public /u/{handle} list).
    public Task<(IEnumerable<Project> Items, int Total)> GetPublishedByOwnerAsync(int ownerId, int skip, int take) =>
        PageAsync(
            _db.Projects
                .AsNoTracking()
                .Where(p => p.OwnerId == ownerId && p.IsPublished)
                .OrderByDescending(p => p.CreatedAt),
            skip, take);

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

    private static async Task<(IEnumerable<Project> Items, int Total)> PageAsync(
        IQueryable<Project> query, int skip, int take)
    {
        var total = await query.CountAsync();
        var items = await query.Skip(skip).Take(take).ToListAsync();
        return (items, total);
    }
}