using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using MlPortfolio.Api.Exceptions;

namespace MlPortfolio.Api.Middleware;

/// <summary>
/// Centralized exception-to-HTTP translator, registered as the app's
/// <see cref="IExceptionHandler"/>. Maps the domain exceptions in
/// <c>MlPortfolio.Api.Exceptions</c> to RFC 7807 ProblemDetails responses so
/// controllers and services can throw semantically and never build error payloads
/// themselves. Unmapped exceptions become a 500 with a generic message; their
/// detail is logged, never returned.
/// </summary>
public class GlobalExceptionHandler : IExceptionHandler
{
    private readonly IProblemDetailsService _problemDetailsService;
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(
        IProblemDetailsService problemDetailsService,
        ILogger<GlobalExceptionHandler> logger)
    {
        _problemDetailsService = problemDetailsService;
        _logger = logger;
    }

    /// <summary>
    /// Maps <paramref name="exception"/> to a status code and writes a
    /// ProblemDetails body. The mapping: <see cref="NotFoundException"/> → 404,
    /// <see cref="ForbiddenAccessException"/> → 403, <see cref="ConflictException"/>
    /// → 409, <see cref="UnauthorizedAccessException"/> → 401; anything else → 500.
    /// Always returns true — this handler claims every exception.
    /// </summary>
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var (statusCode, title) = exception switch
        {
            NotFoundException => (StatusCodes.Status404NotFound, "Not Found"),
            ForbiddenAccessException => (StatusCodes.Status403Forbidden, "Forbidden"),
            ConflictException => (StatusCodes.Status409Conflict, "Conflict"),
            UnauthorizedAccessException => (StatusCodes.Status401Unauthorized, "Unauthorized"),
            MlServiceModelNotFoundException => (StatusCodes.Status404NotFound, "Model Not Found"),
            MlServiceValidationException => (StatusCodes.Status422UnprocessableEntity, "Validation Failed"),
            _ => (StatusCodes.Status500InternalServerError, "Internal Server Error")
        };

        // Only unexpected (500) errors are logged with the full exception; mapped
        // domain exceptions are expected control flow and don't need logging here.
        if (statusCode == StatusCodes.Status500InternalServerError)
            _logger.LogError(exception, "Unhandled exception for {Path}", httpContext.Request.Path);

        httpContext.Response.StatusCode = statusCode;

        return await _problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            Exception = exception,
            ProblemDetails = new ProblemDetails
            {
                Status = statusCode,
                Title = title,
                // Echo the exception message for known/mapped errors, but never leak
                // internal details on an unexpected 500.
                Detail = statusCode == StatusCodes.Status500InternalServerError
                    ? "An unexpected error occurred."
                    : exception.Message
            }
        });
    }
}