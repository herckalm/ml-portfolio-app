using Microsoft.AspNetCore.Mvc;
using MlPortfolio.Api.DTOs;
using MlPortfolio.Api.Services;

namespace MlPortfolio.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest req)
    {
        var response = await _authService.RegisterAsync(req);
        return Ok(response);
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest req)
    {
        var response = await _authService.LoginAsync(req);
        return Ok(response);
    }
}
