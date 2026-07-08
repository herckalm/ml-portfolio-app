// Application composition root.
//
// Boots the API in two phases: (1) configure the DI container and bind/validate
// configuration on the builder, then (2) assemble the middleware pipeline on the
// built app. Order matters in both phases — services must be registered before
// the app is built, and middleware runs in the order added. JWT options are
// validated at startup so a misconfigured secret/issuer/audience fails the boot
// rather than the first request.

using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Options;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using MlPortfolio.Api.Configuration;
using MlPortfolio.Api.Infrastructure.Data;
using MlPortfolio.Api.Middleware;
using MlPortfolio.Api.Repositories;
using MlPortfolio.Api.Services;

// a dependency-free liveness check for the Docker HEALTHCHECK, so the runtime
// image needs no curl. Branches BEFORE host construction — no DI, no DbContext,
// no config validation — then exits 0 (healthy) / 1 (unhealthy). Targets
// 127.0.0.1, not localhost, to avoid the IPv6 ::1 connection-refused hit.

if (args.Contains("--health-check"))
{
    try
    {
        using var probe = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
        var res = await probe.GetAsync("http://127.0.0.1:8080/health");
        Environment.Exit(res.IsSuccessStatusCode ? 0 : 1);
    }
    catch
    {
        Environment.Exit(1);
    }
}

var builder = WebApplication.CreateBuilder(args);

// Services
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Error envelope — every error response is RFC 7807 ProblemDetails, produced by
// the GlobalExceptionHandler registered here.
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

// EF Core + PostgreSQL. The connection string is required; its absence is a
// fail-fast configuration error, not a runtime fallback.
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

// CORS — single named policy for the React dev server (Vite default port).
builder.Services.AddCors(options =>
{
    options.AddPolicy("ReactDev", policy =>
        policy.WithOrigins("http://localhost:5173")
              .AllowAnyMethod()
              .AllowAnyHeader());
});

// JWT — bind options and validate the data annotations at startup.
builder.Services.AddOptions<JwtOptions>()
    .BindConfiguration(JwtOptions.SectionName)
    .ValidateDataAnnotations()
    .ValidateOnStart();

// The bearer middleware below needs the concrete values now (before the app is
// built), so the section is also read eagerly here. The explicit null/blank
// guards duplicate the data-annotation checks deliberately — they guarantee the
// non-null values this setup block depends on, independent of when ValidateOnStart runs.
var jwtOptions = builder.Configuration
    .GetSection(JwtOptions.SectionName)
    .Get<JwtOptions>()
    ?? throw new InvalidOperationException("Jwt configuration section is missing.");

if (string.IsNullOrWhiteSpace(jwtOptions.Secret))
    throw new InvalidOperationException("Jwt:Secret is not configured.");
if (string.IsNullOrWhiteSpace(jwtOptions.Issuer))
    throw new InvalidOperationException("Jwt:Issuer is not configured.");
if (string.IsNullOrWhiteSpace(jwtOptions.Audience))
    throw new InvalidOperationException("Jwt:Audience is not configured.");

// ML inference service — bind options and validate at startup, same fail-fast
// posture as JWT. The typed HttpClient (added in a later step) consumes these
// via IOptions; a missing or malformed BaseUrl stops the boot here.
builder.Services.AddOptions<MlServiceOptions>()
    .BindConfiguration(MlServiceOptions.SectionName)
    .ValidateDataAnnotations()
    .ValidateOnStart();

// Typed HttpClient for the ml-service. BaseAddress + Timeout come from the
// validated MlServiceOptions; IHttpClientFactory owns the handler lifetime.
// The trailing slash on BaseAddress is required so the client's relative URI
// (v1/models/{id}/predict) resolves without dropping a segment.
builder.Services.AddHttpClient<IMlServiceClient, MlServiceClient>((provider, http) =>
{
    var options = provider.GetRequiredService<IOptions<MlServiceOptions>>().Value;
    var baseUrl = options.BaseUrl.EndsWith('/') ? options.BaseUrl : options.BaseUrl + "/";
    http.BaseAddress = new Uri(baseUrl);
    http.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
});

// Application services — all scoped (per-request lifetime), matching the DbContext.
builder.Services.AddScoped<JwtService>();
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IProjectRepository, ProjectRepository>();
builder.Services.AddScoped<IProjectService, ProjectService>();
builder.Services.AddScoped<IUserService, UserService>();

// Authentication — validate issuer, audience, lifetime, and signing key on every
// incoming bearer token. The signing key here must match the one JwtService signs with.
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opts =>
    {
        opts.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidAudience = jwtOptions.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtOptions.Secret))
        };
    });
builder.Services.AddAuthorization();

var app = builder.Build();

// Middleware pipeline — order is significant.
// Exception handler first so it wraps everything downstream in ProblemDetails.
app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// HTTPS redirection only outside development (dev runs plain HTTP on :5013).
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseRouting();
app.UseCors("ReactDev");
// Authentication before authorization: identify the caller, then enforce policy.
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// Health endpoints — liveness (process up) and readiness (DB reachable).
app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));
app.MapGet("/health/db", async (AppDbContext db) =>
{
    try
    {
        // Cheapest possible round-trip to confirm the connection is live.
        await db.Database.ExecuteSqlRawAsync("SELECT 1");
        return Results.Ok(new { status = "healthy", db = "reachable" });
    }
    catch (Exception ex)
    {
        return Results.Json(
            new { status = "unhealthy", db = ex.Message },
            statusCode: 503);
    }
});

app.Run();

// Exposes the implicit top-level Program class to the test assembly so
// WebApplicationFactory<Program> can boot the real app in-process. Top-level
// statements generate an *internal* Program by default; this partial makes it
// public without changing any behavior.
public partial class Program { }