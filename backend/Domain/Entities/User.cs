namespace MlPortfolio.Api.Domain.Entities;

/// <summary>
/// An application account. Carries authentication state (email, password hash,
/// role) and a public profile reachable at <c>/u/{handle}</c>, and owns zero or
/// more <see cref="Project"/> entities. See
/// <see cref="Infrastructure.Data.AppDbContext"/> for column constraints and the
/// unique indexes on <see cref="Email"/> and <see cref="Handle"/>.
/// </summary>
public class User
{
    public int Id { get; set; }
    public string Email { get; set; } = string.Empty;

    /// <summary>Hashed password — never plaintext. Set at registration, verified at login.</summary>
    public string PasswordHash { get; set; } = string.Empty;

    /// <summary>Authorization role for access control (e.g. "user", "admin").</summary>
    public string Role { get; set; } = "user";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Public identity and URL slug. Stored lowercase, unique across users.</summary>
    public string Handle { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;
    public string? Bio { get; set; }

    /// <summary>Projects owned by this user. Initialized empty so it's safe to add to pre-persist.</summary>
    public ICollection<Project> Projects { get; set; } = new List<Project>();
}