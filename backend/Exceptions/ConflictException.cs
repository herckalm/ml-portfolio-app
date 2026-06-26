namespace MlPortfolio.Api.Exceptions;

/// <summary>
/// Thrown when a request conflicts with existing state — e.g. registering an
/// email or handle that's already taken. Mapped to HTTP 409 by the global
/// exception handler.
/// </summary>
public class ConflictException : Exception
{
    public ConflictException(string message) : base(message)
    {
    }
}