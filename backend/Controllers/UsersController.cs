using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MlPortfolio.Api.DTOs;
using MlPortfolio.Api.DTOs.Common;
using MlPortfolio.Api.Services;

namespace MlPortfolio.Api.Controllers;

[ApiController]
[Route("api/users")]
public class UsersController : ControllerBase
{
    private readonly IUserService _users;
    private readonly IProjectService _projects;

    public UsersController(IUserService users, IProjectService projects)
    {
        _users = users;
        _projects = projects;
    }

    // GET /api/users/{handle} — public profile (404 if unknown handle).
    [HttpGet("{handle}")]
    public async Task<ActionResult<UserProfileDto>> GetProfile(string handle)
    {
        var profile = await _users.GetPublicProfileAsync(handle);
        return Ok(profile);
    }

    // GET /api/users/{handle}/projects — public; PUBLISHED only, paged.
    [HttpGet("{handle}/projects")]
    public async Task<ActionResult<PagedResult<ProjectResponseDto>>> GetPublishedProjects(
        string handle, [FromQuery] PaginationQuery query)
    {
        var result = await _projects.GetPublishedByHandleAsync(handle, query);
        return Ok(result);
    }

    // PUT /api/users/me — authenticated; updates the caller's own profile.
    [Authorize]
    [HttpPut("me")]
    public async Task<ActionResult<UserProfileDto>> UpdateMyProfile(UpdateProfileDto dto)
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var profile = await _users.UpdateProfileAsync(userId, dto);
        return Ok(profile);
    }
}