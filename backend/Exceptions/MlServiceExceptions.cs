namespace MlPortfolio.Api.Exceptions;

/// <summary>
/// Base for any non-success the ml-service upstream returns. The upstream's own
/// <c>detail</c> string is carried as the exception message so
/// <see cref="Middleware.GlobalExceptionHandler"/> can echo it into the RFC 7807
/// <c>detail</c> field — the inference path then emits the same problem+json shape as the rest of the API. An unmapped base instance (an upstream status the contract doesn't define, e.g. a 500) falls through the handler to a generic 500.
/// </summary>
public class MlServiceException : Exception
{
    public MlServiceException(string message) : base(message) { }
}

/// <summary>
/// ml-service returned 404 — the requested <c>model_id</c> is not registered.
/// Mapped to a 404 ProblemDetails. Model ids are public identifiers, so surfacing this is safe (unlike the CRUD API's don't-confirm-existence resources).
/// </summary>
public sealed class MlServiceModelNotFoundException : MlServiceException
{
    public MlServiceModelNotFoundException(string message) : base(message) { }
}

/// <summary>
/// ml-service returned 422 — the input failed the service's validation contract
/// (e.g. below the MIN_CHARS floor after cleaning). Mapped to a 422 ProblemDetails.
/// </summary>
public sealed class MlServiceValidationException : MlServiceException
{
    public MlServiceValidationException(string message) : base(message) { }
}

/// <summary>
/// ml-service returned 503 — the model is registered but its artifact isn't loaded. It only reaches the global handler (as a 500) if that conversion is ever bypassed.
/// </summary>
public sealed class MlServiceUnavailableException : MlServiceException
{
    public MlServiceUnavailableException(string message) : base(message) { }
}