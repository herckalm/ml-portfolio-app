using Microsoft.EntityFrameworkCore;
using MlPortfolio.Api.Domain.Entities;

namespace MlPortfolio.Api.Infrastructure.Data;

/// <summary>
/// Entity Framework Core database context for the portfolio application, backed
/// by PostgreSQL (Npgsql). Owns the <see cref="Project"/> and <see cref="User"/>
/// aggregates and centralizes their relational mapping in <see cref="OnModelCreating"/>.
/// </summary>
/// <remarks>
/// The fluent configuration here is the single source of truth for the schema;
/// migrations are scaffolded from it. Constraints worth noting: unique indexes on
/// <see cref="User.Email"/> and <see cref="User.Handle"/>, a composite index on
/// (<see cref="Project.OwnerId"/>, <see cref="Project.IsPublished"/>) that backs
/// the public-by-handle query, and cascade delete from user to projects.
/// </remarks>
public class AppDbContext : DbContext
{
    /// <summary>
    /// Creates the context with externally supplied options (provider, connection
    /// string, etc.), wired up via dependency injection in <c>Program.cs</c>.
    /// </summary>
    /// <param name="options">Configured options for this context instance.</param>
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    /// <summary>Projects table. The portfolio's core showcase entity.</summary>
    public DbSet<Project> Projects => Set<Project>();

    /// <summary>Users table. Account, auth state, and public profile.</summary>
    public DbSet<User> Users => Set<User>();

    /// <summary>
    /// Configures entity-to-table mapping: column constraints, lengths, indexes,
    /// and the Project–User relationship. Invoked once by EF Core when the model
    /// is first built.
    /// </summary>
    /// <param name="modelBuilder">The builder used to construct the model.</param>
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Project>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Description).HasMaxLength(2000);
            entity.Property(e => e.Domain).IsRequired().HasMaxLength(50);

            // Visibility gate; existing rows backfill to false (draft).
            entity.Property(e => e.IsPublished).HasDefaultValue(false);

            // Backs the public-by-handle predicate (OwnerId = … AND IsPublished = true).
            entity.HasIndex(e => new { e.OwnerId, e.IsPublished });

            // Each project has exactly one owner; deleting a user cascades to their projects.
            entity.HasOne(p => p.Owner)
                  .WithMany(u => u.Projects)
                  .HasForeignKey(p => p.OwnerId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Email).IsRequired().HasMaxLength(256);
            entity.HasIndex(e => e.Email).IsUnique();
            entity.Property(e => e.PasswordHash).IsRequired();
            entity.Property(e => e.Role).IsRequired().HasMaxLength(50);

            // Public identity + profile fields.
            entity.Property(e => e.Handle).IsRequired().HasMaxLength(30);
            entity.HasIndex(e => e.Handle).IsUnique();
            entity.Property(e => e.DisplayName).IsRequired().HasMaxLength(80);
            entity.Property(e => e.Bio).HasMaxLength(500);
        });
    }
}