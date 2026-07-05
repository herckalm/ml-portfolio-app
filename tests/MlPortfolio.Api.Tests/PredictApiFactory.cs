using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MlPortfolio.Api.Infrastructure.Data;
using Microsoft.AspNetCore.TestHost;

namespace MlPortfolio.Api.Tests;

/// <summary>
/// Boots the real API in-process for integration tests. Two things are neutralized so the host is hermetic — no live infrastructure, runs anywhere including CI: the Npgsql <see cref="AppDbContext"/> is swapped for EF Core InMemory, and the fail-fast config guards in Program.cs are satisfied with dummy values. The ml-service client itself is left alone here; each test replaces <c>IMlServiceClient</c> with its own stub via <c>WithWebHostBuilder</c>.
/// </summary>
public class PredictApiFactory : WebApplicationFactory<Program>
{
    public PredictApiFactory()
    {
        // The connection-string guard, the JWT block, and MlServiceOptions.ValidateOnStart — all BEFORE any factory ConfigureAppConfiguration would apply. Environment variables are read by WebApplication.CreateBuilder at that same early point, so this is the reliable seam to satisfy the guards. Every value is a dummy: the DB provider is swapped for InMemory below and IMlServiceClient is replaced per-test.

        Environment.SetEnvironmentVariable(
            "ConnectionStrings__DefaultConnection",
            "Host=localhost;Database=test;Username=test;Password=test");
        Environment.SetEnvironmentVariable(
            "Jwt__Secret", "integration-test-signing-key-at-least-32-bytes");
        Environment.SetEnvironmentVariable("Jwt__Issuer", "test-issuer");
        Environment.SetEnvironmentVariable("Jwt__Audience", "test-audience");
        Environment.SetEnvironmentVariable("MlService__BaseUrl", "http://ml-service.test");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Development skips UseHttpsRedirection (the app gates it on !IsDevelopment), so TestServer serves the plain-HTTP path without 307 redirects.
        builder.UseEnvironment("Development");

        // ConfigureTestServices runs AFTER the app's own registrations, so these swaps win. Replace the Npgsql-backed AppDbContext with InMemory: the app still
        // constructs its DbContext, but nothing reaches a real Postgres.

        builder.ConfigureTestServices(services =>
        {
            // Remove every descriptor tied to the app's Npgsql DbContext options — both the options object and the provider-configuration entry EF registers alongside it (its exact type name varies across EF versions, so match defensively). Leaving the provider config in place would trip EF's "only a single provider" guard when we add InMemory below.

            var toRemove = services.Where(d =>
                d.ServiceType == typeof(DbContextOptions<AppDbContext>) ||
                d.ServiceType == typeof(DbContextOptions) ||
                (d.ServiceType.FullName?.Contains("DbContextOptionsConfiguration") ?? false))
                .ToList();
            foreach (var descriptor in toRemove)
                services.Remove(descriptor);

            services.AddDbContext<AppDbContext>(options =>
                options.UseInMemoryDatabase("predict-integration-tests"));
        });
    }
}