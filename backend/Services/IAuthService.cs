using MlPortfolio.Api.DTOs;

namespace MlPortfolio.Api.Services;

/// <summary>
/// Authentication operations: account registration and login. Both return an
/// <see cref="AuthResponse"/> carrying a freshly issued JWT and the user's public
/// identity.
/// </summary>
public interface IAuthService
{
    /// <summary>Creates an account (resolving/validating the handle) and returns a session token.</summary>
    Task<AuthResponse> RegisterAsync(RegisterRequest req);

    /// <summary>Verifies credentials and returns a session token, or throws on failure.</summary>
    Task<AuthResponse> LoginAsync(LoginRequest req);
}