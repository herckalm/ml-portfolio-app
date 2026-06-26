using Microsoft.AspNetCore.Mvc;
using MlPortfolio.Api.DTOs;
using MlPortfolio.Api.Services;

namespace MlPortfolio.Api.Controllers;

/// <summary>
/// Anonymous auth endpoints under <c>api/auth</c>: registration and login. Both
/// are thin pass-throughs to <see cref="IAuthService"/> and return an
/// <see cref="AuthResponse"/> (JWT + identity). No <c>[Authorize]</c> here by
/// design — these are how a caller obtains a token in the first place.
/// </summary>
[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    /// <summary>Registers a new account and returns an authenticated session token.</summary>
    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest req)
    {
        var response = await _authService.RegisterAsync(req);
        return Ok(response);
    }

    /// <summary>Verifies credentials and returns a session token on success.</summary>
    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest req)
    {
        var response = await _authService.LoginAsync(req);
        return Ok(response);
    }
}