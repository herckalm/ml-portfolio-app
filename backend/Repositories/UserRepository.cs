using Microsoft.EntityFrameworkCore;
using MlPortfolio.Api.Domain.Entities;
using MlPortfolio.Api.Exceptions;
using MlPortfolio.Api.Infrastructure.Data;
using Npgsql;

namespace MlPortfolio.Api.Repositories;

public class UserRepository : IUserRepository
{
    private readonly AppDbContext _db;

    public UserRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<bool> ExistsByEmailAsync(string email)
    {
        return await _db.Users.AnyAsync(u => u.Email == email);
    }

    public async Task<User?> GetByEmailAsync(string email)
    {
        return await _db.Users.FirstOrDefaultAsync(u => u.Email == email);
    }

    public async Task<User> CreateAsync(User user)
    {
        try
        {
            _db.Users.Add(user);
            await _db.SaveChangesAsync();
            return user;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" } pg)
        {
            // a unique-index violation that raced past the pre-checks.
            var name = pg.ConstraintName ?? string.Empty;
            if (name.Contains("Email", StringComparison.OrdinalIgnoreCase))
                throw new ConflictException("Email already registered.");
            if (name.Contains("Handle", StringComparison.OrdinalIgnoreCase))
                throw new ConflictException("That handle isn't available.");
            throw new ConflictException("That account already exists.");
        }
    }

    public async Task<User?> GetByHandleAsync(string handle)
    {
        var normalized = handle.Trim().ToLowerInvariant();
        return await _db.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Handle == normalized);
    }

    public async Task<bool> ExistsByHandleAsync(string handle)
    {
        var normalized = handle.Trim().ToLowerInvariant();
        return await _db.Users.AnyAsync(u => u.Handle == normalized);
    }

    public async Task<User?> GetByIdAsync(int id)
    {
        return await _db.Users.FindAsync(id);
    }

    public async Task<User> UpdateAsync(User user)
    {
        _db.Users.Update(user);
        await _db.SaveChangesAsync();
        return user;
    }
}