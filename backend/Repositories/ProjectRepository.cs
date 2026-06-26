using Microsoft.EntityFrameworkCore;
using MlPortfolio.Api.Domain.Entities;
using MlPortfolio.Api.Infrastructure.Data;

namespace MlPortfolio.Api.Repositories;

/// <summary>
/// EF Core implementation of <see cref="IProjectRepository"/>. Read queries use
/// <c>AsNoTracking</c> and push filtering/ordering/paging into SQL; the one
/// tracked read (<see cref="GetByIdAsync"/>) feeds the mutation paths. Paging is
/// centralized in <see cref="PageAsync"/>, which returns the page plus the total
/// count for <c>PagedResult</c>.
/// </summary>
public class ProjectRepository : IProjectRepository
{
    private readonly AppDbContext _db;

    public ProjectRepository(AppDbContext db)
    {
        _db = db;
    }

    public Task<(IEnumerable<Project> Items, int Total)> GetByOwnerAsync(int ownerId, int skip, int take) =>
        PageAsync(
            _db.Projects
                .AsNoTracking()
                .Where(p => p.OwnerId == ownerId)
                .OrderByDescending(p => p.CreatedAt),
            skip, take);

    public Task<(IEnumerable<Project> Items, int Total)> GetPublishedByOwnerAsync(int ownerId, int skip, int take) =>
        PageAsync(
            _db.Projects
                .AsNoTracking()
                .Where(p => p.OwnerId == ownerId && p.IsPublished)
                .OrderByDescending(p => p.CreatedAt),
            skip, take);

    public async Task<Project?> GetByIdAsync(int id)
    {
        // Callers that mutate (update/delete/publish) rely on change tracking.
        return await _db.Projects.FindAsync(id);
    }

    public async Task<Project?> GetPublishedByIdAsync(int id)
    {
        // Read-only public detail: no tracking, and the IsPublished filter runs in SQL.
        return await _db.Projects
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == id && p.IsPublished);
    }

    public async Task<Project> CreateAsync(Project project)
    {
        _db.Projects.Add(project);
        await _db.SaveChangesAsync();
        return project;
    }

    public async Task<Project> UpdateAsync(Project project)
    {
        // No explicit Update(): the entity is already tracked (loaded via GetByIdAsync),
        // so SaveChanges emits an UPDATE touching only the columns that actually changed.
        await _db.SaveChangesAsync();
        return project;
    }

    public async Task DeleteAsync(Project project)
    {
        _db.Projects.Remove(project);
        await _db.SaveChangesAsync();
    }

    /// <summary>
    /// Runs a count then a skip/take against the same query, returning the page
    /// and the unpaged total. Two round-trips by design — the total is needed for
    /// pagination metadata.
    /// </summary>
    private static async Task<(IEnumerable<Project> Items, int Total)> PageAsync(
        IQueryable<Project> query, int skip, int take)
    {
        var total = await query.CountAsync();
        var items = await query.Skip(skip).Take(take).ToListAsync();
        return (items, total);
    }
}