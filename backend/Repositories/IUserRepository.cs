using MlPortfolio.Api.Domain.Entities;

namespace MlPortfolio.Api.Repositories;

/// <summary>
/// Persistence contract for <see cref="User"/>. Covers existence checks and
/// lookups by the three identities a user is addressed by — email (auth), handle
/// (public profile), and id (self-service) — plus create/update/delete. Handle
/// lookups normalize input; see the implementation for the exact rule.
/// </summary>
public interface IUserRepository
{
    /// <summary>True if an account with this email exists. Pre-registration check.</summary>
    Task<bool> ExistsByEmailAsync(string email);

    /// <summary>User by email (tracked), or null. The login lookup.</summary>
    Task<User?> GetByEmailAsync(string email);

    /// <summary>
    /// Inserts a new user. Translates a unique-constraint violation into a
    /// <c>ConflictException</c> rather than surfacing the raw DB error.
    /// </summary>
    Task<User> CreateAsync(User user);

    /// <summary>User by public handle (untracked, normalized lookup), or null.</summary>
    Task<User?> GetByHandleAsync(string handle);

    /// <summary>True if the (normalized) handle is already taken.</summary>
    Task<bool> ExistsByHandleAsync(string handle);

    /// <summary>User by id (tracked) for self-service update/delete, or null.</summary>
    Task<User?> GetByIdAsync(int id);

    /// <summary>Persists changes to an already-tracked user.</summary>
    Task<User> UpdateAsync(User user);

    /// <summary>Deletes a user; cascades to their projects via the FK.</summary>
    Task DeleteAsync(User user);
}