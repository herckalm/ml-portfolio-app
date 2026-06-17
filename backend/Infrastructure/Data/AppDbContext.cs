using Microsoft.EntityFrameworkCore;
using MlPortfolio.Api.Domain.Entities;

namespace MlPortfolio.Api.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Project> Projects => Set<Project>();
    public DbSet<User> Users => Set<User>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Project>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Description).HasMaxLength(2000);
            entity.Property(e => e.Domain).IsRequired().HasMaxLength(50);

            // visibility gate; existing rows backfill to false (draft)
            entity.Property(e => e.IsPublished).HasDefaultValue(false);

            // matches the public-by-handle predicate (OwnerId = … AND IsPublished = true)
            entity.HasIndex(e => new { e.OwnerId, e.IsPublished });

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

            // public identity + profile
            entity.Property(e => e.Handle).IsRequired().HasMaxLength(30);
            entity.HasIndex(e => e.Handle).IsUnique();
            entity.Property(e => e.DisplayName).IsRequired().HasMaxLength(80);
            entity.Property(e => e.Bio).HasMaxLength(500);
        });
    }
}